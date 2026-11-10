from pathlib import Path
import json,sys,time
root=Path(__file__).resolve().parent
(root/'control.json').write_text(json.dumps({'action':sys.argv[1],'sequence':time.time_ns()}))
print('Injected synthetic provider action: '+sys.argv[1])
