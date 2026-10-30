import subprocess
import time
import json
import urllib.request
import asyncio
import sys

# We can query chrome DevTools protocol
# Or write a small script that injects JS into HTML or reads via CDP

test_html_script = """
window.addEventListener('load', () => {
  setTimeout(() => {
    const report = {
      windowWidth: window.innerWidth,
      bodyWidth: document.body.offsetWidth,
      rootWidth: document.getElementById('root')?.offsetWidth,
      mainWidth: document.querySelector('main')?.offsetWidth,
      cardWidth: document.querySelector('main > div')?.offsetWidth,
      headerWidth: document.querySelector('header')?.offsetWidth,
      elementsOver350: []
    };
    document.querySelectorAll('*').forEach(el => {
      const w = el.offsetWidth;
      if (w > 350) {
        report.elementsOver350.push({
          tag: el.tagName,
          cls: (el.className || '').toString().substring(0, 40),
          width: w,
          text: (el.innerText || '').substring(0, 30).replace(/\\n/g, ' ')
        });
      }
    });
    console.log('===LAYOUT_REPORT===' + JSON.stringify(report));
    document.title = 'REPORT:' + JSON.stringify(report);
  }, 500);
});
"""

print("Debug script ready")
