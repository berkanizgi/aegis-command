# Implementation contract

The root project is outputs/aegis-command. Plain Node ESM server modules, React TS frontend, Electron CJS desktop host. No framework needed for backend; use Node builtins.

Frontend API: `await window.aegis.invoke(operation, payload)` in Electron. Browser preview: POST `/api/invoke` JSON `{operation,payload}`, header `X-Aegis-Client: aegis-ui`. All returned values are the direct service result; errors throw with readable messages. UI polls `state` every ~2 sec and after mutations.

Service export: `createService({dataDir, secureStorage, desktop, fetchImpl})` async -> `{invoke(operation,payload), close()}`. secureStorage optional `{encryptString(text):Buffer, decryptString(buffer):string}` (Electron safeStorage); persistence must be atomic. desktop: `{pickFolder(), openPath(path), openExternal(url), notify(title,body), getSystemInfo(), captureScreen(), setAutostart(enabled)}` optional methods. Screen captures user-selected only. Default dataDir local outside tracked files.

State: `{settings,missions,memories,commitments,routines,activity,messages,connectors,focus,shadow,usage}`. Public settings `{name:'Boss',language:'de',model:'gpt-4.1-mini',realtimeModel:'gpt-realtime-mini',voice:'cedar',provider:'openai',hasApiKey,workspace,autoSpeak:false,autostart:false,dailyRequestLimit:100, ...}`. Never return secrets. Each item id string; dates ISO. missions `{id,title,goal,status:'draft'|'running'|'approval'|'completed'|'failed'|'paused',steps:[{id,title,tool,args,status,result?,error?}],createdAt,updatedAt,summary?,error?}`. memories `{id,title,content,tags:string[],createdAt}`. commitments `{id,title,dueAt,person,status:'open'|'done',createdAt}`. routines `{id,title,prompt,enabled:false,intervalMinutes:60,lastRun?,nextRun?}`. activity `{id,title,detail,status,createdAt,undoable?:boolean}`. messages `{id,role,content,createdAt}`. connectors array `{id,name,description,connected:boolean,status,capabilities:string[]}`. focus `{active,endsAt?}`. shadow `{active,startedAt?,events:[]}`.

Operations:

- state -> State
- chat `{message}` -> `{message:string}` (tool loop, persists messages)
- missions.create `{goal,title?}` -> Mission (AI plan when configured; explicit local templates otherwise)
- missions.run `{id}`; missions.approve `{id,stepId}`; missions.pause `{id}`; missions.delete `{id}`
- memory.save `{title,content,tags?}`; memory.delete `{id}`; memory.search `{query}`
- commitments.save `{title,dueAt?,person?}`; commitments.done `{id}`
- settings.update `{name?,provider?,apiKey?,model?,realtimeModel?,voice?,workspace?,dailyRequestLimit?,autoSpeak?,autostart?}`
- connector.configure `{id, ...credentials}` -> sanitized status; connector.test `{id}`; connector.disconnect `{id}`; connector.connect `{id}` -> OAuth/device flow info
- workspace.pick -> `{path}`; workspace.search `{query}`; workspace.open `{path}`
- tools.execute `{name,args}` -> tool result, NEVER bypass confirmation for risky actions; pending actions can be represented as a mission approval
- routines.save `{id?,title,prompt,enabled?,intervalMinutes?}`; routines.run `{id}`; routines.delete `{id}`
- shadow.start; shadow.event `{title,app?,url?}`; shadow.stop -> `{routine?,events}` (routine draft from observed events)
- focus.start `{minutes}`; focus.stop
- briefing -> `{message}`
- activity.undo `{id}`
- screen.analyze `{image?,question}` (desktop.captureScreen if image omitted)
- realtime.session `{sdp}` -> `{sdp}` using server-side OpenAI key unified WebRTC call. Session tool `aegis_command` with `{message}` routed client-side back through chat to enforce all policies.

Connector module export `createConnectors({getSettings,getSecret,setSecret,fetchImpl,desktop})` -> `{list(), configure(id,data), connect(id), test(id), disconnect(id), tools(), execute(name,args)}`. Tools OpenAI Responses function schema `{type:'function',name,description,parameters,strict:false}` plus own metadata `risk:'read'|'write'`, `connector`. Engine must strip own metadata before OpenAI. Connector prefix names `github_*`, `google_*`, `microsoft_*`, `home_*`, `web_search`. Safe defaults: reads automatic, all external writes approval required. Do not fake external data or success. Missing credentials -> actionable setup error. API keys entered inside Settings only.

Root owns package config, scripts, electron/, src/lib/voice.ts, integration QA, docs. Frontend agent owns all other src/, index.html, vite.config.ts, tsconfig.json. Core agent owns server/service.mjs, server/store.mjs, server/local-tools.mjs and tests/core.test.mjs. Connector agent owns server/connectors.mjs and tests/connectors.test.mjs. Coordinate changing contracts in messages.
