(function(){
  var els=document.querySelectorAll('body *'),c=[];
  for(var i=0;i<els.length;i++){var e=els[i];if(e.children.length>0)continue;
    var t=(e.textContent||'').trim();if(!/^[0-9][0-9.,]*\s?[KkMm]?$/.test(t))continue;
    var p=e.parentElement,pc=(p&&p.className&&p.className.toString())||'';
    if(/asphaltBlack|text-sm/.test(pc))continue;
    c.push({e:e,t:t,pc:pc});}
  if(!c.length)return 'points element not found';
  var x=c.filter(function(o){return !o.pc})[0]||c[0];
  var b=x.e.closest('button,[role=button],a')||x.e.parentElement;
  b.click();return 'clicked '+x.t+' <'+b.tagName.toLowerCase()+'>';
})()
