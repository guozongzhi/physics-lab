/** Untrusted student HTML runs in an opaque origin, without application credentials. */
export default function HtmlDemo({ html, title }: { html: string; title: string }) {
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
  return <iframe title={title} sandbox="allow-scripts" referrerPolicy="no-referrer"
    srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}">${html}`}
    className="w-full h-[65vh] min-h-[360px] bg-white rounded-xl border border-blue-200" />;
}
