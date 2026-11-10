import {z} from 'zod';
export const billingSchema=z.object({legalName:z.string().max(300),inn:z.string().max(12),kpp:z.string().max(9),address:z.string().max(600),bankName:z.string().max(300),bik:z.string().max(9),correspondentAccount:z.string().max(20),account:z.string().max(20),signatory:z.string().max(150),accountant:z.string().max(150)});
