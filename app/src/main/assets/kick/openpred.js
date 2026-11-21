(function(){
  // viewer view: opens the prediction panel by pressing the card's "Predict" button (it only opens the panel, it places no bet)
  var bs=document.querySelectorAll('button');
  for(var i=0;i<bs.length;i++){
    var t=(bs[i].innerText||'').trim();
    if(/^(predict|توقع|توقّع)$/i.test(t)&&!bs[i].disabled){bs[i].click();return 'clicked predict'}
  }
  return 'no predict button';
})()
