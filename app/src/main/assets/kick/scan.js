(function(){
  var out=[], els=document.querySelectorAll('body *');
  for(var i=0;i<els.length&&out.length<60;i++){
    var e=els[i];
    if(e.children.length>0) continue;
    var t=(e.textContent||'').trim();
    if(!/^[0-9][0-9.,]*\s?[KkMmBb]?$/.test(t)) continue;
    var r=e.getBoundingClientRect();
    if(r.width===0&&r.height===0) continue;
    var p=e.parentElement;
    out.push({
      t:t, tag:e.tagName.toLowerCase(),
      c:(e.className&&e.className.toString?e.className.toString():'').slice(0,50),
      pc:(p&&p.className&&p.className.toString?p.className.toString():'').slice(0,50),
      y:Math.round(r.top), x:Math.round(r.left),
      icon:!!(p&&p.querySelector('svg,img')),tt:(function(){var n=e;for(var d=0;d<4&&n;d++,n=n.parentElement){var v=n.getAttribute&&(n.getAttribute('title')||n.getAttribute('aria-label')||n.getAttribute('data-tooltip'));if(v)return v.slice(0,60)}return ''})()
    });
  }
  var vs=[], vids=document.querySelectorAll('video');
  for(var j=0;j<vids.length&&j<4;j++){ vs.push({paused:vids[j].paused, muted:vids[j].muted, t:Math.round(vids[j].currentTime)}); }
  var tl=[],tq=document.querySelectorAll('[title],[aria-label]');for(var q=0;q<tq.length&&tl.length<12;q++){var sv=tq[q].getAttribute('title')||tq[q].getAttribute('aria-label')||'';if(!/\d/.test(sv))continue;var rr=tq[q].getBoundingClientRect();tl.push({s:sv.slice(0,60),y:Math.round(rr.top),x:Math.round(rr.left)})}
  var lo=Array.prototype.some.call(document.querySelectorAll("button,a"),function(b){return /^(log ?in|login|sign ?in|sign ?up|تسجيل الدخول)$/i.test((b.innerText||"").trim())});
  return JSON.stringify({url:location.href, vw:innerWidth, vh:innerHeight, videos:vs, items:out, titles:tl, lo:lo});
})()
