window.onerror = function (msg, src, line, col, err) {
  console.log("JS Error:", msg, src, line, col, err);
  var pre = document.createElement('pre');
  pre.textContent = "Error: " + msg + "\n" + src + ":" + line;
  pre.style.padding = "12px";
  pre.style.background = "#111";
  pre.style.color = "#f33";
  document.body.insertBefore(pre, document.body.firstChild);
};
