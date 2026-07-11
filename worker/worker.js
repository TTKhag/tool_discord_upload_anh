export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === '/kenh' && request.method === 'POST') {
        return await layDanhSachKenh(request, env, corsHeaders);
      }
      if (url.pathname === '/tinnhan' && request.method === 'POST') {
        return await layAnhTrongKenh(request, env, corsHeaders);
      }
      if (url.pathname === '/upanh' && request.method === 'POST') {
        return await uploadAnh(request, env, corsHeaders);
      }
      if (url.pathname === '/taokenh' && request.method === 'POST') {
        return await taoKenh(request, env, corsHeaders);
      }
      if (url.pathname === '/anh' && request.method === 'POST') {
        return await layAnhGoc(request, env, corsHeaders);
      }
      return jsonRes({ loi: 'Không tìm thấy endpoint' }, 404, corsHeaders);
    } catch (err) {
      return jsonRes({ loi: 'Lỗi server: ' + err.message }, 500, corsHeaders);
    }
  },
};

function jsonRes(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

// Xác thực mật khẩu + lấy danh sách kênh của guild
async function layDanhSachKenh(request, env, corsHeaders) {
  const body = await request.json();

  if (body.mat_khau !== env.APP_PASSWORD) {
    return jsonRes({ loi: 'Sai mật khẩu' }, 401, corsHeaders);
  }

  const res = await fetch(`https://discord.com/api/v10/guilds/${body.guild_id}/channels`, {
    headers: { Authorization: `Bot ${env.BOT_TOKEN}` },
  });
  const data = await res.json();

  if (!res.ok) {
    return jsonRes({ loi: 'Không lấy được kênh (mã ' + res.status + ')', chi_tiet: data }, res.status, corsHeaders);
  }
  return jsonRes({ kenh: data }, 200, corsHeaders);
}

// Lấy danh sách ảnh (attachments) từ các tin nhắn trong 1 kênh
async function layAnhTrongKenh(request, env, corsHeaders) {
  const body = await request.json();

  if (body.mat_khau !== env.APP_PASSWORD) {
    return jsonRes({ loi: 'Sai mật khẩu' }, 401, corsHeaders);
  }

  const channelId = body.channel_id;
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=100`, {
    headers: { Authorization: `Bot ${env.BOT_TOKEN}` },
  });
  const data = await res.json();

  if (!res.ok) {
    return jsonRes({ loi: 'Không lấy được tin nhắn (mã ' + res.status + ')', chi_tiet: data }, res.status, corsHeaders);
  }

  // Không trả url gốc của Discord CDN về trình duyệt — chỉ trả id để FE gọi
  // ngược lại endpoint /anh khi cần hiển thị, tránh lộ link ảnh qua DOM/devtools.
  const tinNhan = data.map(tn => ({
    id: tn.id,
    attachments: (tn.attachments || [])
      .filter(a => (a.content_type || '').startsWith('image/'))
      .map(a => ({ id: a.id, filename: a.filename })),
  }));

  return jsonRes({ tin_nhan: tinNhan }, 200, corsHeaders);
}

// Lấy đúng 1 ảnh gốc (proxy): FE gửi id tin nhắn + id đính kèm, Worker tự tra
// lại link thật trên Discord rồi stream bytes về, link CDN gốc không bao giờ
// lộ ra phía trình duyệt.
async function layAnhGoc(request, env, corsHeaders) {
  const body = await request.json();

  if (body.mat_khau !== env.APP_PASSWORD) {
    return jsonRes({ loi: 'Sai mật khẩu' }, 401, corsHeaders);
  }

  const { channel_id, message_id, attachment_id } = body;
  if (!channel_id || !message_id || !attachment_id) {
    return jsonRes({ loi: 'Thiếu tham số' }, 400, corsHeaders);
  }

  const resTin = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages/${message_id}`, {
    headers: { Authorization: `Bot ${env.BOT_TOKEN}` },
  });
  if (!resTin.ok) {
    return jsonRes({ loi: 'Không lấy được tin nhắn gốc (mã ' + resTin.status + ')' }, resTin.status, corsHeaders);
  }
  const tinNhan = await resTin.json();
  const dinhKem = (tinNhan.attachments || []).find(a => a.id === attachment_id);
  if (!dinhKem) {
    return jsonRes({ loi: 'Không tìm thấy ảnh' }, 404, corsHeaders);
  }

  const resAnh = await fetch(dinhKem.url);
  if (!resAnh.ok || !resAnh.body) {
    return jsonRes({ loi: 'Không tải được ảnh gốc' }, 502, corsHeaders);
  }

  return new Response(resAnh.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': dinhKem.content_type || 'application/octet-stream',
      'Cache-Control': 'no-store',
    },
  });
}

// Tạo danh mục (type 4) hoặc kênh chữ (type 0) trong guild
async function taoKenh(request, env, corsHeaders) {
  const body = await request.json();

  if (body.mat_khau !== env.APP_PASSWORD) {
    return jsonRes({ loi: 'Sai mật khẩu' }, 401, corsHeaders);
  }

  const { guild_id, name, type, parent_id } = body;
  if (!guild_id || !name || !name.trim() || (type !== 0 && type !== 4)) {
    return jsonRes({ loi: 'Thiếu hoặc sai tham số (cần name và type là 0 hoặc 4)' }, 400, corsHeaders);
  }

  const payload = { name: name.trim(), type };
  if (type === 0 && parent_id) payload.parent_id = parent_id;

  const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/channels`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${env.BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();

  if (!res.ok) {
    return jsonRes({ loi: 'Không tạo được (mã ' + res.status + ')', chi_tiet: data }, res.status, corsHeaders);
  }
  return jsonRes({ ok: true, kenh: data }, 200, corsHeaders);
}

// Nhận ảnh từ FE (tối đa 10 ảnh/lần) và up lên kênh Discord
async function uploadAnh(request, env, corsHeaders) {
  const formData = await request.formData();

  if (formData.get('mat_khau') !== env.APP_PASSWORD) {
    return jsonRes({ loi: 'Sai mật khẩu' }, 401, corsHeaders);
  }

  const channelId = formData.get('channel_id');
  const files = formData.getAll('files');

  if (!channelId || files.length === 0) {
    return jsonRes({ loi: 'Thiếu channel_id hoặc ảnh' }, 400, corsHeaders);
  }
  if (files.length > 10) {
    return jsonRes({ loi: 'Tối đa 10 ảnh/lần' }, 400, corsHeaders);
  }

  const discordForm = new FormData();
  const attachments = files.map((f, i) => ({ id: i, filename: f.name }));
  discordForm.append('payload_json', JSON.stringify({ content: '', attachments }));
  files.forEach((f, i) => discordForm.append(`files[${i}]`, f, f.name));

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${env.BOT_TOKEN}` },
    body: discordForm,
  });
  const data = await res.json();

  if (!res.ok) {
    return jsonRes({ loi: 'Mã lỗi ' + res.status, chi_tiet: data }, res.status, corsHeaders);
  }
  return jsonRes({ ok: true, ket_qua: data }, 200, corsHeaders);
}

