const api=window.cuaView;
const error=document.querySelector('#error');
async function request(op){try{error.textContent='';render(await api.request(op));}catch(e){error.textContent=e.message;}}
function render(tabs){const container=document.querySelector('#tabs');container.replaceChildren();for(const tab of tabs){const cell=document.createElement('div');cell.className='tab'+(tab.active?' active':'');const select=document.createElement('button');select.textContent=tab.title||'New tab';select.onclick=()=>request({action:'select',target:tab.target});const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','Close tab');close.onclick=()=>request({action:'close',target:tab.target});cell.append(select,close);container.append(cell);if(tab.active&&document.activeElement!==document.querySelector('#url'))document.querySelector('#url').value=tab.url;}}
document.querySelector('#navigation').onsubmit=e=>{e.preventDefault();request({action:'navigate',url:document.querySelector('#url').value});};
for(const button of document.querySelectorAll('[data-action]'))button.onclick=()=>request({action:button.dataset.action});
api.onState(render);request({action:'state'});
