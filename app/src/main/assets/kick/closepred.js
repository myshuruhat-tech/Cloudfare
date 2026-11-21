(function(){
  ['keydown','keyup'].forEach(function(k){var e=new KeyboardEvent(k,{key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true});document.dispatchEvent(e);if(document.activeElement)document.activeElement.dispatchEvent(e)});
  var d=document.querySelector('[role=dialog] button[aria-label*=close i]');if(d)d.click();
  return 'closed';
})()
