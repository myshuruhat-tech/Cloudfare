(function(){
  if(window.__ls_kb) return; window.__ls_kb=1;
  setInterval(function(){
    document.querySelectorAll('video').forEach(function(v){
      try{ v.muted=true; v.volume=0; if(v.paused) v.play().catch(function(){}); }catch(e){}
    });
  },3000);
})();
