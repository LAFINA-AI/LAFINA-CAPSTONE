"""Loopback protocol fixture. Drops microphone bytes; no STT/LLM/HTTP/backend."""
import asyncio, base64, json, math, struct, time
from pathlib import Path
import websockets

ROOT=Path(__file__).resolve().parent
SUMMARY={'synthetic':True,'backend_used':False,'sessions':[]}
def save(): (ROOT/'provider-summary.json').write_text(json.dumps(SUMMARY,indent=2))
class Session:
 def __init__(self,ws):
  self.ws=ws;self.event=0;self.playing=None;self.stats={'mic_frames':0,'pongs':0,'stops':0,'injected':[],'closed':False};SUMMARY['sessions'].append(self.stats);save()
 async def send(self,obj):await self.ws.send(json.dumps(obj))
 async def audio(self):
  for _ in range(300):
   pcm=b''.join(struct.pack('<h',int(1800*math.sin(2*math.pi*330*i/16000))) for i in range(1600))
   await self.send({'type':'audio','audio_event':{'audio_base_64':base64.b64encode(pcm).decode(),'event_id':self.event}})
   await asyncio.sleep(.1)
 async def cancel_audio(self):
  if self.playing:self.playing.cancel();self.playing=None
 async def reply(self):
  self.event+=1
  await self.send({'type':'agent_response','agent_response_event':{'agent_response':'This is a synthetic local test reply. A tone tests Android playback; no AI or ElevenLabs is running.','event_id':self.event}})
  self.playing=asyncio.create_task(self.audio())
 async def command(self,c):
  action=c['action'];self.stats['injected'].append({'action':action,'at_ms':int(time.time()*1000)});save()
  if action=='partial':await self.send({'type':'tentative_user_transcript','tentative_user_transcription_event':{'user_transcript':'Please wait while I pause'}})
  elif action=='final':
   self.event+=1;await self.send({'type':'user_transcript','user_transcription_event':{'user_transcript':'Please wait while I pause and finish my sentence.','event_id':self.event}});await self.reply()
  elif action=='reply':await self.reply()
  elif action=='interrupt':
   await self.cancel_audio();await self.send({'type':'interruption','interruption_event':{'event_id':self.event}})
  elif action=='drop':await self.ws.close(1011,'synthetic network failure')
 async def control(self):
  path=ROOT/'control.json';last=path.read_text() if path.exists() else None
  while True:
   await asyncio.sleep(.1)
   if path.exists():
    raw=path.read_text()
    if raw!=last:
     last=raw
     try:await self.command(json.loads(raw))
     except (json.JSONDecodeError,KeyError):pass
 async def ping(self):
  while True:
   await asyncio.sleep(3);self.event+=1;await self.send({'type':'ping','ping_event':{'event_id':self.event,'ping_ms':20}});save()
 async def run(self):
  first=json.loads(await self.ws.recv());assert first['type']=='conversation_initiation_client_data'
  self.stats['voice_override_received']=bool(first.get('conversation_config_override',{}).get('tts',{}).get('voice_id'))
  await self.send({'type':'conversation_initiation_metadata','conversation_initiation_metadata_event':{'conversation_id':'local_fixture_'+str(len(SUMMARY['sessions'])),'agent_output_audio_format':'pcm_16000','user_input_audio_format':'pcm_16000'}})
  control=asyncio.create_task(self.control());ping=asyncio.create_task(self.ping())
  try:
   async for raw in self.ws:
    m=json.loads(raw)
    if 'user_audio_chunk' in m:self.stats['mic_frames']+=1 # Drop immediately, never decode/store microphone audio.
    elif m.get('type')=='pong':self.stats['pongs']+=1
    elif m.get('type')=='user_activity':self.stats['stops']+=1;await self.cancel_audio()
    elif m.get('type')=='user_message':
     self.event+=1;await self.send({'type':'user_transcript','user_transcription_event':{'user_transcript':m['text'],'event_id':self.event}});await self.reply()
  except websockets.ConnectionClosed:pass
  finally:
   control.cancel();ping.cancel();await self.cancel_audio();self.stats['closed']=True;save()
async def main():
 async def handler(ws):await Session(ws).run()
 async with websockets.serve(handler,'127.0.0.1',8766):
  print('Local synthetic provider ready on loopback 8766',flush=True);await asyncio.Future()
if __name__=='__main__':asyncio.run(main())
