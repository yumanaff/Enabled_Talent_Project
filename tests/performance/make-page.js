// Builds a heavy test page, similar to a long Wikipedia article:
// about 36,000 words, 3,000 links, 60 icon buttons, 80 images, tables and a form.
// The page is generated, so the numbers are the same on every run.
function makePage() {
  const words = "the city council met on tuesday to talk about new bike lanes bus routes housing and parks across the region for next year while people shared their ideas".split(" ");
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sentence = (n) => Array.from({ length: n }, () => words[Math.floor(rand() * words.length)]).join(" ");
  const parts = ['<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Heavy test page</title>',
    "<style>body{font:16px/1.5 Georgia,serif;margin:0} nav{position:sticky;top:0;background:#fff;display:flex;gap:4px;flex-wrap:wrap} .icon{width:32px;height:32px} main{max-width:760px;margin:0 auto;padding:16px} img{width:120px;height:80px;background:#ccc}</style></head><body>"];
  parts.push("<nav>" + Array.from({ length: 60 }, (_, i) => `<button class="icon" aria-label="Tool ${i}" title="Tool ${i}">☰</button>`).join("") + "</nav><main><h1>Heavy test page</h1>");
  for (let s = 0; s < 60; s++) {
    parts.push(`<h2>Section ${s}</h2>`);
    for (let p = 0; p < 10; p++) {
      const links = Array.from({ length: 5 }, (_, i) => `<a href="${i % 2 ? "/wiki/Page_" + s + "_" + p + "_" + i : "https://example" + i + ".org/x"}">${sentence(2)}</a>`);
      parts.push(`<p>${sentence(12)} ${links[0]} ${sentence(10)} ${links[1]} ${sentence(10)} ${links[2]} ${sentence(10)} ${links[3]} ${sentence(8)} ${links[4]}.</p>`);
    }
    if (s % 6 === 0) {
      parts.push('<img alt="A photo of the city" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">'.repeat(8));
      parts.push("<table><tr>" + "<th>Year</th><th>People</th>".repeat(3) + "</tr>" + ("<tr>" + "<td>2020</td><td>1000</td>".repeat(3) + "</tr>").repeat(10) + "</table>");
    }
  }
  parts.push('<form><label>Name <input name="name"></label><label>Email <input name="email" type="email"></label><label>Message <textarea name="msg"></textarea></label></form>');
  parts.push("</main></body></html>");
  return parts.join("\n");
}
module.exports = { makePage };
