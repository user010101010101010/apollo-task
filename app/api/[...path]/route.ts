import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {handleRequest} from '../../../server/login.mjs';
export const dynamic='force-dynamic';
async function handle(request:Request){return handleRequest(request,env,await getChatGPTUser());}
export const GET=handle;
export const POST=handle;
export const PUT=handle;
export const DELETE=handle;
