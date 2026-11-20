(function(){
  var re=/poll|prediction|predict|vote|توقع|تصويت|استطلاع/i, out=[], els=document.querySelectorAll('div,section,aside,li');
  var BT='button,[role=button]';
  for(var i=0;i<els.length&&out.length<4;i++){
    var e=els[i], t=(e.innerText||'').trim();
    if(!t||t.length>600||!re.test(t)) continue;
    var bs=e.querySelectorAll(BT); if(bs.length<2) continue;
    var inner=false;
    for(var k=0;k<e.children.length;k++){var c=e.children[k]; if(re.test(c.innerText||'')&&c.querySelectorAll(BT).length>=2){inner=true;break}}
    if(inner) continue;
    var b=[]; for(var j=0;j<bs.length&&j<6;j++){b.push({t:(bs[j].innerText||'').trim().slice(0,40),c:(bs[j].className&&bs[j].className.toString?bs[j].className.toString():'').slice(0,60)})}
    out.push({tag:e.tagName.toLowerCase(),c:(e.className&&e.className.toString?e.className.toString():'').slice(0,80),t:t.slice(0,200),b:b,h:e.outerHTML.slice(0,500)});
  }
  return JSON.stringify({n:out.length,items:out});
})()
