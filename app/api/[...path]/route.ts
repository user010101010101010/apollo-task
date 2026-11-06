import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {handleAPI} from '../../../server/api.mjs';
export const dynamic='force-dynamic';
async function handle(request:Request){return handleAPI(request,env,await getChatGPTUser());}
export const GET=handle;
export const POST=handle;
export const PUT=handle;
export const DELETE=handle;
