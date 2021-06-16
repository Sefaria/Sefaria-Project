import { rest } from 'msw';
import { data } from './data';

export const handlers = [
    rest.post('/api/subscribe/:email', (req, res, ctx) => {
        const { email } = req.params
        const lists = req.url.searchParams.get('lists').split('|');
        if (!Sefaria.util.isValidEmailAddress(email)) {
            return res(ctx.json({error: "Sorry, there was an error."}))
        }
        if (lists.length === 0) {
            return res(ctx.json({error: "Please specifiy a list."}))
        }
        return res(ctx.json({status: "ok"}))
    }),
    rest.get('/api/v2/index/:title', (req, res, ctx) => {
        const { title } = req.params
        return res(ctx.json(data['api/v2/index'][title]));
    }),
    rest.get('/api/texts/versions/:title', (req, res, ctx) => {
        const { title } = req.params;
        return res(ctx.json(data['api/texts/versions'][title]));
    })
];