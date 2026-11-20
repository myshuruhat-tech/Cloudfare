(function(){
  var p=document.getElementById('rewards-panel'); if(!p) return 'no rewards panel';
  var bs=p.querySelectorAll('button,[role=button]');
  for(var i=0;i<bs.length;i++){
    var t=(bs[i].innerText||'').replace(/\s+/g,' ').trim();
    if(/predict|poll|توقع|استطلاع|تصويت/i.test(t)){bs[i].click();return 'row: '+t.slice(0,50)}
  }
  return 'no prediction row';
})()
