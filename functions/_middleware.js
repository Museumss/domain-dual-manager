const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const cookieName = "dm_session";
const enc = new TextEncoder();

async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function makeSession(secret) {
  const payload = btoa(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000 })).replace(/=+$/,"");
  return payload + "." + await sign(payload, secret);
}
async function validSession(request, secret) {
  const raw = request.headers.get("Cookie") || "";
  const token = raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(cookieName+"="))?.slice(cookieName.length+1);
  if (!token || !secret) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !(await sign(payload,secret) === signature)) return false;
  try { return JSON.parse(atob(payload)).exp > Date.now(); } catch { return false; }
}
const cookie = (value, maxAge) => `${cookieName}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
function cleanHost(value) {
  const host = String(value || "").trim().toLowerCase().replace(/\.$/,"");
  if (host.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/.test(host)) return null;
  return host;
}
function validTarget(value) {
  try { const u = new URL(value); return ["http:","https:"].includes(u.protocol) ? u.href : null; } catch { return null; }
}
async function body(request) { try { return await request.json(); } catch { return {}; } }

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path.startsWith("/api/")) {
    if (!env.DB) return json({error:"数据库尚未绑定。请在 Pages Settings → Functions 中绑定 D1，变量名填写 DB。"},503);
    if (path === "/api/login" && request.method === "POST") {
      const input = await body(request);
      if (input.username !== "admin" || !env.ADMIN_PASSWORD || input.password !== env.ADMIN_PASSWORD) return json({error:"账号或密码错误"},401);
      if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return json({error:"管理员会话密钥未正确配置，请在 Cloudflare 环境变量中设置 SESSION_SECRET（至少 32 字符）"},503);
      const token = await makeSession(env.SESSION_SECRET);
      return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json","cache-control":"no-store","set-cookie":cookie(token,28800)}});
    }
    if (path === "/api/logout" && request.method === "POST") return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json","set-cookie":cookie("",0)}});
    if (!(await validSession(request, env.SESSION_SECRET))) return json({error:"登录状态已失效，请重新登录"},401);
    if (path === "/api/me" && request.method === "GET") return json({ok:true});
    if (path === "/api/domains" && request.method === "GET") {
      const result = await env.DB.prepare("SELECT * FROM domains ORDER BY created_at DESC").all();
      return json({domains:result.results || []});
    }
    if (path === "/api/domains" && request.method === "POST") {
      const d = await body(request), host = cleanHost(d.hostname), target = validTarget(d.target_url);
      if (!host || !target) return json({error:"请填写有效域名和 http/https 目标网址"},400);
      if (!["redirect","direct"].includes(d.mode)) return json({error:"访问模式无效"},400);
      const id = crypto.randomUUID();
      try {
        await env.DB.prepare("INSERT INTO domains (id,hostname,mode,target_url,page_title,page_description,enabled) VALUES (?,?,?,?,?,?,?)")
          .bind(id,host,d.mode,target,String(d.page_title||"安全访问").slice(0,80),String(d.page_description||"请确认目标地址后继续访问。").slice(0,240),d.enabled===false?0:1).run();
        return json({ok:true,id},201);
      } catch { return json({error:"域名已存在，或数据库写入失败"},409); }
    }
    const match = path.match(/^\/api\/domains\/([a-f0-9-]{36})$/i);
    if (match && request.method === "PUT") {
      const d = await body(request), host = cleanHost(d.hostname), target = validTarget(d.target_url);
      if (!host || !target || !["redirect","direct"].includes(d.mode)) return json({error:"域名、目标网址或模式无效"},400);
      try {
        const result = await env.DB.prepare("UPDATE domains SET hostname=?,mode=?,target_url=?,page_title=?,page_description=?,enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(host,d.mode,target,String(d.page_title||"安全访问").slice(0,80),String(d.page_description||"请确认目标地址后继续访问。").slice(0,240),d.enabled?1:0,match[1]).run();
        return json({ok:true,changes:result.meta?.changes||0});
      } catch { return json({error:"更新失败，可能是域名重复"},409); }
    }
    if (match && request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM domains WHERE id=?").bind(match[1]).run();
      return json({ok:true});
    }
    return json({error:"接口不存在"},404);
  }

  // Pages 自带域名仅作为管理后台入口；其他自定义域名按 D1 配置处理。
  const host = cleanHost(request.headers.get("host")?.split(":")[0]);
  if (!host) return new Response("Invalid host",{status:400});
  if (host.endsWith(".pages.dev") || host === "pages.dev" || host.endsWith(".workers.dev")) return next();

  if (!env.DB) return new Response("Service is not configured",{status:503});
  const domain = await env.DB.prepare("SELECT * FROM domains WHERE hostname=? AND enabled=1 LIMIT 1").bind(host).first();
  if (!domain) return new Response("This domain is not configured.",{status:404,headers:{"content-type":"text/plain; charset=utf-8"}});
  await env.DB.prepare("UPDATE domains SET visits=visits+1 WHERE id=?").bind(domain.id).run();
  if (domain.mode === "redirect") return Response.redirect(domain.target_url,302);

  const safe = s => String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const target = safe(domain.target_url);
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${safe(domain.page_title)}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#0a1020;color:#edf3ff;font:16px/1.7 system-ui,sans-serif}.card{width:min(100%,520px);padding:36px;border:1px solid #293b5b;border-radius:22px;background:#111d31;box-shadow:0 25px 80px #0006}h1{font-size:28px;margin:0 0 12px}p{color:#a9b8ce;overflow-wrap:anywhere}.url{font-size:13px;color:#70d9dd;background:#0a1424;padding:12px;border-radius:9px;overflow-wrap:anywhere}a{display:block;text-align:center;margin-top:22px;padding:13px;border-radius:10px;background:#75a0ff;color:#071323;text-decoration:none;font-weight:700}</style><main class="card"><h1>${safe(domain.page_title)}</h1><p>${safe(domain.page_description)}</p><div class="url">${target}</div><a href="${target}" rel="noopener noreferrer">确认目标并继续访问</a></main></html>`;
  return new Response(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
}
