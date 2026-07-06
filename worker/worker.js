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
      if (url.pathname === '/upanh' && request.method === 'POST') {
        return await uploadAnh(request, env, corsHeaders);
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
