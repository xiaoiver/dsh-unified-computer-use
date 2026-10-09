const api=window.cuaView;
const video=document.querySelector('#video'),status=document.querySelector('#status');
let media,closed=false;
function stop(){closed=true;for(const track of media?.getTracks()||[])track.stop();video.srcObject=null;}
window.addEventListener('pagehide',stop);
document.querySelector('#close').onclick=()=>{stop();api.request({action:'close'}).catch(()=>{});};
document.querySelector('#reveal').onclick=()=>api.request({action:'reveal'}).catch(e=>{status.textContent=e.message;status.hidden=false;});
async function start(){try{document.querySelector('#title').textContent=(await api.request({action:'state'})).title;media=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:15,width:{ideal:960,max:1280},height:{ideal:600,max:800}},audio:false});if(closed){stop();return;}video.srcObject=media;const track=media.getVideoTracks()[0];track.onended=()=>{stop();api.request({action:'ended'}).catch(()=>{});};video.onloadedmetadata=()=>{status.hidden=true;document.querySelector('#live').classList.add('ready');api.request({action:'video',width:video.videoWidth,height:video.videoHeight}).catch(()=>{});};await video.play();}catch(e){stop();status.textContent='Preview unavailable: '+e.message;status.hidden=false;}}
start();
