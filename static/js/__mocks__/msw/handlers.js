import { rest } from 'msw';
import { apiData } from './apiData';

const getApiData = (httpMethod, urlBegin, requestValues) => {
    /*
    in general, these parameters reflect the format defined in scripts/generateApiData.py
    httpMethod: http method in all lowercase. e.g. 'get'
    urlBegin: beginning of url
    requestValues: array. first element should be end of url followed by optional url params and post body (if httpMethod is 'post')
    */
    const requestKey = requestValues.map(value => JSON.stringify(value)).join("|")
    try {
        const response = apiData[httpMethod][urlBegin][requestKey];
        return response;
    } catch(e) {
        console.log("YO");
    }
};

const dataHandlerInputs = [
    {httpMethod: 'get', urlBegin: '/api/v2/index', urlEnd: 'title'},
    {httpMethod: 'get', urlBegin: '/api/texts/versions', urlEnd: 'title'},
    {httpMethod: 'get', urlBegin: '/api/texts', urlEnd: 'ref', params: ['context']},
];
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
].concat(dataHandlerInputs.map(({httpMethod, urlBegin, urlEnd, params=[]}) => {
    return rest[httpMethod](`${urlBegin}/:${urlEnd}`, (req, res, ctx) => {
        const paramObj = {};
        let hasParamValues = false;
        for (let param of params) {
            const paramValue = req.url.searchParams.get(param);
            if (typeof paramValue != 'undefined') {
                paramObj[param] = paramValue;
                hasParamValues = true;
            }
        }
        const requestValues = [req.params[urlEnd]];
        if (hasParamValues) { requestValues.push(paramObj); }
        return res(ctx.json(getApiData(httpMethod, urlBegin, requestValues)))
    });
}));