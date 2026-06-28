import { getApiBaseUrl } from './connectionConfig';

const parseJsonSafely = async (response) => {
    const text = await response.text();
    if (!text) return {};

    try {
        return JSON.parse(text);
    } catch {
        return {};
    }
};

export const apiRequest = async (path, options = {}) => {
    const { body, headers, ...rest } = options;

    const response = await fetch(`${getApiBaseUrl()}${path}`, {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...headers
        },
        body: body ? JSON.stringify(body) : undefined,
        ...rest
    });

    const payload = await parseJsonSafely(response);

    if (!response.ok) {
        throw new Error(payload.message || 'Request failed.');
    }

    return payload;
};
