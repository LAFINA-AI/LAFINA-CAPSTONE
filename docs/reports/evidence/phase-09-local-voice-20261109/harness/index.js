import React, {useEffect, useState} from 'react';
import {AppRegistry, View, Text, PermissionsAndroid, DeviceEventEmitter} from 'react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {VoiceConversationPanel} from '../../src/ui/components/voice/VoiceConversationPanel';
import {useCommandReview} from '../../src/ui/hooks/useCommandReview';
import {db, initDatabase, localSettingsStore} from '../../src/storage';
import {nativeVoiceTransport, NATIVE_EVENT} from '../../src/cloud/voiceConversation/nativeTransport';
import {VOICE_CONSENT_KEY} from '../../src/cloud/voiceConversation';

// Private QA entry only. No auth, HTTP API, DeepSeek or ElevenLabs calls.
// Native WebSocket capture/playback and the product controller/screen are real.
global.fetch = async () => { throw new Error('HTTP disabled in local-only QA'); };
const owner = 'local-voice-fixture';
const saved = [];
const api = {
  capabilities: async () => ({ok: true, data: {enabled: true, maxDurationSeconds: 300, maxTurns: 30}}),
  createSession: async () => ({ok: true, data: {
    sessionId: '11111111-2222-3333-4444-555555555555',
    signedUrl: 'ws://127.0.0.1:8766/v1/convai/conversation',
    grant: 'local-fixture-only', voiceId: 'local_synthetic_tone',
    expiresAt: new Date(Date.now()+300000).toISOString(), maxDurationSeconds: 300, maxTurns: 30,
  }}),
  connected: async () => { console.log('[LocalQA] connected callback'); },
  end: async () => { console.log('[LocalQA] end callback'); },
  status: async () => ({ok: true, data: {status: 'active', lastErrorCode: null, lastErrorMessage: null}}),
};
DeviceEventEmitter.addListener(NATIVE_EVENT, event => {
  if (['mic','playback','ended','closed','error','backgrounded'].includes(event.kind)) {
    console.log('[LocalQA] native '+JSON.stringify({kind:event.kind,capturing:event.capturing,speaking:event.speaking,code:event.code}));
  }
});
const deps = () => ({
  gates: {isGuest:()=>false, isSignedInOwner:()=>true, isOnlineMode:()=>true,
    isOnline:async()=>true, hasConsent:()=>true,
    ensureMicPermission:async()=>PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)},
  getVoice:()=>({id:'local_synthetic_tone',name:'LOCAL TEST TONE'}), useHandbook:()=>false,
  api, transport:nativeVoiceTransport, allowLocalTestServer:true,
  persistence: {
    userTurn: text => { saved.push({role:'user',text}); console.log('[LocalQA] saved user '+saved.length); },
    assistantTurn: (text,heard) => {saved.push({role:'assistant',text,heard});console.log('[LocalQA] saved assistant '+heard+' '+saved.length);},
  },
  log: line=>console.log('[LocalQA] '+line),
});
function Panel() {
  const review=useCommandReview(owner,'voice');
  return <ThemeProvider userId={null}><View style={{flex:1,padding:20,paddingTop:45,backgroundColor:'#faf9f6'}}>
    <Text style={{color:'#b00020',fontSize:18,fontWeight:'bold'}}>LOCAL QA — synthetic provider, no backend</Text>
    <Text style={{color:'#333',marginVertical:10}}>Real conversation screen and Android audio. No speech recognition or AI answers.</Text>
    <VoiceConversationPanel userId={owner} review={review} onBack={()=>{}} deps={deps}/>
  </View></ThemeProvider>;
}
function App(){
 const [ready,setReady]=useState(false); const [error,setError]=useState('');
 useEffect(()=>{initDatabase().then(()=>{
  const now=new Date().toISOString();
  db.executeSync("INSERT OR IGNORE INTO users (id,username,email,role,is_new_user,time_format_24h,week_starts_monday,dark_mode,created_at,updated_at) VALUES (?,?,?,'student',0,0,0,0,?,?)",[owner,owner,'local-voice@example.invalid',now,now]);
  localSettingsStore.set(owner,VOICE_CONSENT_KEY,'true');setReady(true);
 }).catch(e=>setError(e.message));},[]);
 return ready?<Panel/>:<Text>{error||'Preparing isolated local QA...'}</Text>;
}
AppRegistry.registerComponent('LafinaCapstone',()=>App);
