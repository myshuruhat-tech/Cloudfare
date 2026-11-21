(function(){
  var step=__STEP__,want=__OPT__,amt=__AMT__;
  if(step==='confirm'){
    var cb=document.querySelectorAll('button');
    for(var c=0;c<cb.length;c++){var ct=(cb[c].innerText||'').trim();if(/^(ok|confirm|okay)$/i.test(ct)&&cb[c].getBoundingClientRect().width>4&&!cb[c].disabled){cb[c].click();return 'ok confirmed '+ct}}
    return 'no confirm needed';
  }
  if(step==='result'){
    var m=(document.body.innerText||'').match(/(you spent[^\n]{0,40}|not enough[^\n]{0,40}|insufficient[^\n]{0,40}|prediction (?:closed|ended)[^\n]{0,30})/i);
    return m?m[1]:'no result text';
  }
  var forms=document.querySelectorAll('form'),form=null;
  for(var i=0;i<forms.length;i++){if(/prediction amount/i.test(forms[i].innerText||'')&&forms[i].querySelector('input')){form=forms[i];break}}
  if(!form)return 'no panel';
  function lines(b){return (b.innerText||'').split(/\n+/).map(function(s){return s.trim()}).filter(Boolean)}
  if(step==='select'){
    var bs=form.querySelectorAll('button[type=button]');
    for(var j=0;j<bs.length;j++){var L=lines(bs[j]);if(L.length&&L[0]===want&&!/^(predict|not now)$/i.test(L[0])){bs[j].click();return 'ok selected'}}
    return 'no option';
  }
  if(step==='amount'){
    var inp=form.querySelector('input');if(!inp)return 'no input';
    var set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    set.call(inp,String(amt));inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}));
    return 'ok amount '+inp.value;
  }
  if(step==='submit'){
    var all=form.querySelectorAll('button');
    for(var k=0;k<all.length;k++){var t=(all[k].innerText||'').trim();if(/^predict$/i.test(t)){if(all[k].disabled)return 'predict disabled';all[k].click();return 'ok submitted'}}
    return 'no predict button';
  }
  return 'bad step';
})()
