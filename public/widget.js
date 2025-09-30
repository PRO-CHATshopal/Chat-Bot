(function(){
  const API = '/api/chat';
  const root = document.createElement('div');
  root.id = 'ai-chat-root';
  root.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;';
  root.innerHTML = `
    <button id="ai-open" style="padding:12px 16px;border-radius:9999px;border:0;box-shadow:0 6px 18px rgba(0,0,0,.25)">Chat</button>
    <div id="ai-panel" style="display:none;width:340px;height:460px;background:#fff;border-radius:16px;box-shadow:0 12px 24px rgba(0,0,0,.25);overflow:hidden;margin-top:8px;">
      <div style="padding:12px;font-weight:600;border-bottom:1px solid #eee">Assistant</div>
      <div id="ai-log" style="height:330px;padding:12px;overflow:auto;font-size:14px;"></div>
      <div style="display:flex;border-top:1px solid #eee">
        <input id="ai-input" placeholder="Ask about products, shipping…" style="flex:1;padding:10px;border:0">
        <button id="ai-send" style="padding:10px 14px;border:0">Send</button>
      </div>
    </div>`;
  document.body.appendChild(root);

  const openBtn = root.querySelector('#ai-open');
  const panel = root.querySelector('#ai-panel');
  const log = root.querySelector('#ai-log');
  const input = root.querySelector('#ai-input');
  const send = root.querySelector('#ai-send');

  const add = (role, text)=>{
    const el=document.createElement('div');
    el.style.margin='6px 0';
    el.innerHTML=`<strong>${role}:</strong> ${text}`;
    log.appendChild(el);
    log.scrollTop=log.scrollHeight;
  };

  openBtn.onclick = ()=> panel.style.display = panel.style.display==='none'?'block':'none';

  send.onclick = async ()=>{
    const msg = (input.value||'').trim();
    if(!msg) return;
    add('You', msg);
    input.value='';
    try{
      const res = await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body: JSON.stringify({ message: msg })});
      const data = await res.json();
      add('Assistant', data.reply||'…');
    }catch(e){ add('Assistant','(Network error)'); }
  };
})();
