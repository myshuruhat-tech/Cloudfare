(function(){
  function vis(e){var r=e.getBoundingClientRect();if(r.width<4||r.height<4)return false;
    for(var n=e;n&&n.nodeType===1;n=n.parentElement){if(n.getAttribute('aria-hidden')==='true')return false;
      var cs=getComputedStyle(n);if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)===0)return false}return true}
  function T(e){return (e.innerText||e.textContent||'').trim()}
  function cls(e){return (e.className&&e.className.toString?e.className.toString():'')}
  // outline: one line per element (tag, short class, role/aria/testid, leaf text) instead of raw HTML
  function outline(root){var L=[];(function walk(e,d){if(L.length>=42||d>7)return;
    var t=e.tagName.toLowerCase();if(t==='svg'){L.push(Array(d+1).join(' ')+'svg');return}
    var a=[];['role','aria-label','data-testid','type','disabled'].forEach(function(k){var v=e.getAttribute(k);if(v!==null)a.push(k+'='+String(v).slice(0,25))});
    var own=e.children.length===0?T(e).slice(0,40):'';
    L.push(Array(d+1).join(' ')+t+(cls(e)?' .'+cls(e).slice(0,55):'')+(a.length?' ['+a.join(' ')+']':'')+(own?' "'+own+'"':''));
    for(var i=0;i<e.children.length;i++)walk(e.children[i],d+1)})(root,0);return L.join('\n')}
  function ot(e){var r='';for(var c=e.firstChild;c;c=c.nextSibling){if(c.nodeType===3)r+=c.nodeValue}return r.trim()}
  function up(e,test,max){for(var n=e,i=0;n&&i<max;n=n.parentElement,i++){if(test(n))return n}return null}
  var groups=[
    {k:'poll',   a:/^(current poll|poll ended|poll)\b/i,                                     ok:function(n){var x=T(n);return /%/.test(x)&&/\(\d+\)/.test(x)&&x.length<500},max:12},
    {k:'predict',a:/^prediction amount$/i,                                ok:function(n){return /options/i.test(T(n))&&/your balance/i.test(T(n))&&/predict/i.test(T(n))},max:14},
    {k:'banner', a:/(distributed|prediction ended|prediction closes in|predictions? (?:is )?open)/i, ok:function(n){return T(n).length>25},max:4}
  ];
  groups.push({k:'predend',a:/^outcomes$/i,ok:function(n){return /winner/i.test(T(n))&&/outcomes/i.test(T(n))&&/points contributed/i.test(T(n))},max:14});
  groups.push({k:'predcard',a:/^(see details|predict|manage)$/i,ok:function(n){var x=T(n);return x.length<200&&(/\bvs\b/.test(x)||/winner:/i.test(x)||/\d\.\s/.test(x))},max:5});
  groups.push({k:'pinned',a:/^sent by/i,ok:function(n){return T(n).length>30},max:4});
  var out=[],leaves=document.querySelectorAll('body *');
  for(var i=0;i<leaves.length&&out.length<8;i++){var e=leaves[i];
    var t=e.children.length===0?T(e):ot(e);if(!t||t.length>60)continue;
    for(var g=0;g<groups.length;g++){var G=groups[g];if(!G.a.test(t))continue;
      var c=up(e,G.ok,G.max);if(!c)continue;
      if(out.some(function(o){return o.el===c||(o.k===G.k&&(o.el.contains(c)||c.contains(o.el)))}))continue;
      var bs=c.querySelectorAll('button,[role=button],input,[role=radio],[role=option]'),b=[];
      for(var j=0;j<bs.length&&j<10;j++)b.push({t:(T(bs[j])||bs[j].value||bs[j].tagName).slice(0,24),a:(bs[j].getAttribute('aria-label')||bs[j].getAttribute('data-testid')||'').slice(0,24)});
      out.push({el:c,k:G.k,tag:G.k+':'+c.tagName.toLowerCase()+(vis(c)?'':' HIDDEN'),c:cls(c).slice(0,80),t:T(c).replace(/\s+/g,' ').slice(0,200),b:b,h:outline(c)})}}
  var ic=[],all=document.querySelectorAll('button,[role=button]');
  for(var q=0;q<all.length&&ic.length<14;q++){var bt=all[q];if(T(bt)||!vis(bt))continue;
    ic.push({c:cls(bt).slice(0,50),l:(bt.getAttribute('aria-label')||bt.getAttribute('title')||'').slice(0,30),y:Math.round(bt.getBoundingClientRect().top),w:Math.round(bt.getBoundingClientRect().width)})}
  return JSON.stringify({n:out.length,items:out.map(function(o){delete o.el;return o}),icons:ic,u:location.href.slice(0,80),tx:((document.body&&document.body.innerText)||'').replace(/\s+/g,' ').slice(0,420)});
})()
