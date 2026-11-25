/**
 * Updatini API — Cloudflare Worker.
 *
 * Routes (all authenticated with `Authorization: Bearer <ADMIN_TOKEN>`):
 *   POST /api/upload/start   create an R2 multipart upload
 *   PUT  /api/upload/part    upload one binary chunk
 *   POST /api/upload/finish  complete the upload and index the release
 *   GET  /api/bundles        list releases, newest first
 *
 * Static assets in public/ are served by Workers Assets for every other path.
 */
const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });

export default {
  async fetch(req, env) {
    if (req.headers.get("authorization") !== `Bearer ${env.ADMIN_TOKEN}`)
      return json({ error: "Invalid or missing admin token" }, 401);

    const url = new URL(req.url);
    const p = url.pathname;

    if (p === "/api/upload/start" && req.method === "POST") {
      const { name } = await req.json();
      const key = `bundles/${Date.now()}-${String(name).replace(/[^\w.-]/g, "_")}`;
      const mp = await env.BUCKET.createMultipartUpload(key);
      return json({ key, uploadId: mp.uploadId });
    }

    if (p === "/api/upload/part" && req.method === "PUT") {
      try {
        const key = url.searchParams.get("key");
        const id = url.searchParams.get("id");
        const n = Number(url.searchParams.get("n"));
        const data = await req.arrayBuffer();
        const part = await env.BUCKET.resumeMultipartUpload(key, id).uploadPart(n, data);
        return json(part);
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }

    if (p === "/api/upload/finish" && req.method === "POST") {
      const b = await req.json();
      if (!/^(all|board:[\w.-]{1,64})$/.test(b.target)) return json({ error: "Invalid target" }, 400);
      await env.BUCKET.resumeMultipartUpload(b.key, b.uploadId).complete(b.parts);
      await env.DB.prepare(
        "INSERT INTO bundles (key, version, compatible, target, size, created_at) VALUES (?,?,?,?,?,?)"
      ).bind(b.key, b.version, b.compatible, b.target, b.size, Date.now()).run();
      return json({ ok: true });
    }

    if (p === "/api/bundles" && req.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM bundles ORDER BY created_at DESC").all();
      return json(results);
    }

    return json({ error: "Not found" }, 404);
  },
};
