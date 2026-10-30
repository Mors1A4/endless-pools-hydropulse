import subprocess
import json
import time

DIST_DIR = r"c:\Users\monty\Documents\AB\pool\app\dist"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

# Start chrome headless and evaluate JS
eval_js = """
const docW = document.documentElement.scrollWidth;
const bodyW = document.body.scrollWidth;
const winW = window.innerWidth;
const badEls = [];
document.querySelectorAll('*').forEach(el => {
  const r = el.getBoundingClientRect();
  if (r.right > winW + 1) {
    badEls.push({
      tag: el.tagName,
      cls: el.className,
      right: Math.round(r.right),
      width: Math.round(r.width),
      text: (el.innerText || '').substring(0, 40).replace(/\\n/g, ' ')
    });
  }
});
console.log(JSON.stringify({ winW, docW, bodyW, badEls: badEls.slice(0, 10) }));
"""

with open(r"c:\Users\monty\Documents\AB\pool\scripts\check.js", "w") as f:
    f.write(eval_js)

# Run chrome with dump-dom or run a node script using puppeteer or a python script
print("Evaluation script created")
