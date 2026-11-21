(function(){
  // __OPTION__ is replaced by Kotlin with a JSON string. Clicks ONLY a poll option button whose name matches exactly.
  var want=__OPTION__;
  var anchors=document.querySelectorAll('[data-testid=poll-expand-collapse-button],[data-testid=poll-delete-button]'),box=null;
  for(var n=anchors.length?anchors[0].parentElement:null,i=0;n&&i<8;n=n.parentElement,i++){var t=(n.innerText||'');if(/%/.test(t)&&/\(\d+\)/.test(t)){box=n;break}}
  if(!box)return 'no poll';
  var bs=box.querySelectorAll('button');
  for(var j=0;j<bs.length;j++){var b=bs[j],tid=b.getAttribute('data-testid')||'';
    if(/delete|collapse|expand/i.test(tid))continue;
    var m=(b.innerText||'').trim().split(/\n+/).map(function(s){return s.trim()}).filter(Boolean);
    if(m.length>=3&&/^\(\d+\)$/.test(m[m.length-1])&&m.slice(0,m.length-2).join(' ')===want){b.click();return 'clicked'}}
  return 'no option';
})()
