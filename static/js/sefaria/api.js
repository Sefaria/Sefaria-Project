export default async function read(url, headers = {}) {
    const response = await fetch(url, {
        method: 'GET',
        headers: headers,
        credentials: 'include',
    });
    return response.json();
}
