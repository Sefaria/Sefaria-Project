/**
 * communityBooksApi.js
 *
 * Centralized API module for community book operations.
 * Set USE_MOCKS = false when the backend is ready.
 *
 * All functions return Promises so callers are unaffected when mocks flip to real calls.
 */

import Sefaria from "./sefaria/sefaria";
import Cookies from "js-cookie";

// ---------------------------------------------------------------------------
// Feature flag: switch to false once the backend is live
// ---------------------------------------------------------------------------
const USE_MOCKS = true;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the common headers for API requests that send a body.
 * For multipart/form-data (FormData) do NOT pass Content-Type — the browser
 * sets the boundary automatically.
 */
function _csrfHeaders(isJson = true) {
    const headers = {
        "X-CSRFToken": Cookies.get("csrftoken"),
    };
    if (isJson) {
        headers["Content-Type"] = "application/json";
    }
    return headers;
}

// ---------------------------------------------------------------------------
// License options — shared by upload form and display components
// ---------------------------------------------------------------------------

export const LICENSE_OPTIONS = [
    {
        value: "CC BY",
        label: "CC BY",
        description: "Others may distribute, remix, and build upon your work, even commercially, as long as they credit you.",
    },
    {
        value: "CC BY-SA",
        label: "CC BY-SA",
        description: "Others may remix and build upon your work, even commercially, as long as they credit you and license their new creations under identical terms.",
    },
    {
        value: "CC BY-NC",
        label: "CC BY-NC",
        description: "Others may remix and build upon your work non-commercially, as long as they credit you.",
    },
    {
        value: "CC BY-ND",
        label: "CC BY-ND",
        description: "Others may reuse your work for any purpose, including commercially, but they cannot share adaptations of your work. Credit is required.",
    },
    {
        value: "All Rights Reserved",
        label: "All Rights Reserved",
        description: "No rights are granted to others. Standard copyright applies.",
    },
];

// ---------------------------------------------------------------------------
// Mock data factories
// ---------------------------------------------------------------------------

function _mockUploadResponse(formData) {
    const fileName = formData && formData.get && formData.get("file")
        ? formData.get("file").name || "uploaded_book.pdf"
        : "uploaded_book.pdf";

    return {
        success: true,
        preview: {
            chapters: [
                { title: "Introduction",         sectionCount: 5,  wordCount: 1200 },
                { title: "Chapter One",           sectionCount: 12, wordCount: 4800 },
                { title: "Chapter Two",           sectionCount: 10, wordCount: 4100 },
                { title: "Chapter Three",         sectionCount: 9,  wordCount: 3700 },
                { title: "Conclusion",            sectionCount: 3,  wordCount: 900  },
            ],
            totalWordCount: 14700,
            detectedDepth: 2,
        },
        gcsUrl: `https://storage.googleapis.com/mock-community-books/${encodeURIComponent(fileName)}`,
    };
}

function _mockConfirmResponse(bookData) {
    const bookId = `mock-book-${Date.now()}`;
    return {
        success: true,
        bookId,
        title: bookData.title || "My Community Book",
        url: `/texts/Community/${encodeURIComponent(bookData.title || bookId)}`,
    };
}

const _MOCK_BOOKS = [
    {
        title: "The Light of Torah",
        heTitle: "אור התורה",
        description: "A collection of teachings on weekly Torah portions.",
        heDescription: "קובץ דרשות על פרשיות השבוע.",
        submittedBy: "user_123",
        submitterName: "Avraham Cohen",
        submittedAt: "2026-03-15T10:30:00Z",
        submissionStatus: "approved",
        license: "CC BY",
        categories: ["Torah", "Parasha"],
        topics: ["parshanut", "weekly-torah-portion"],
        url: "/texts/Community/The_Light_of_Torah",
    },
    {
        title: "Gates of Prayer",
        heTitle: "שערי תפילה",
        description: "Commentary and guide to Jewish liturgy.",
        heDescription: "פירוש ומדריך לתפילה.",
        submittedBy: "user_456",
        submitterName: "Miriam Levi",
        submittedAt: "2026-04-02T14:15:00Z",
        submissionStatus: "approved",
        license: "CC BY-SA",
        categories: ["Prayer"],
        topics: ["tefilla", "liturgy"],
        url: "/texts/Community/Gates_of_Prayer",
    },
    {
        title: "Paths of Halakha",
        heTitle: "נתיבות ההלכה",
        description: "A practical guide to Jewish law for modern life.",
        heDescription: "מדריך מעשי להלכה בחיים המודרניים.",
        submittedBy: "user_789",
        submitterName: "Yosef Mizrachi",
        submittedAt: "2026-04-20T09:00:00Z",
        submissionStatus: "approved",
        license: "All Rights Reserved",
        categories: ["Halakha"],
        topics: ["halakha", "jewish-law"],
        url: "/texts/Community/Paths_of_Halakha",
    },
];

// Bulk-books mock: keyed by title, shaped like the topic-page tab expects.
const _MOCK_BULK_BOOKS = {
    "The Light of Torah": {
        sheet_id: 10001,
        sheet_title: "The Light of Torah",
        sheet_summary: "A collection of teachings on weekly Torah portions.",
        publisher_name: "Avraham Cohen",
        publisher_id: "user_123",
        publisher_url: "/profile/user_123",
        publisher_image: "https://via.placeholder.com/50",
        is_community_book: true,
        license: "CC BY",
        order: 1,
    },
    "Gates of Prayer": {
        sheet_id: 10002,
        sheet_title: "Gates of Prayer",
        sheet_summary: "Commentary and guide to Jewish liturgy.",
        publisher_name: "Miriam Levi",
        publisher_id: "user_456",
        publisher_url: "/profile/user_456",
        publisher_image: "https://via.placeholder.com/50",
        is_community_book: true,
        license: "CC BY-SA",
        order: 2,
    },
    "Paths of Halakha": {
        sheet_id: 10003,
        sheet_title: "Paths of Halakha",
        sheet_summary: "A practical guide to Jewish law for modern life.",
        publisher_name: "Yosef Mizrachi",
        publisher_id: "user_789",
        publisher_url: "/profile/user_789",
        publisher_image: "https://via.placeholder.com/50",
        is_community_book: true,
        license: "All Rights Reserved",
        order: 3,
    },
};

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Upload a community book file.
 *
 * @param {FormData} formData — must include a "file" field with the book file.
 * @returns {Promise<{success: boolean, preview: {chapters: Array, totalWordCount: number, detectedDepth: number}, gcsUrl: string}>}
 */
export async function uploadCommunityBook(formData) {
    if (USE_MOCKS) {
        return Promise.resolve(_mockUploadResponse(formData));
    }

    // Do NOT set Content-Type; browser sets multipart/form-data + boundary.
    const response = await fetch(Sefaria.apiHost + "/api/community-books/upload", {
        method: "POST",
        headers: { "X-CSRFToken": Cookies.get("csrftoken") },
        credentials: "same-origin",
        body: formData,
    });

    if (!response.ok) {
        throw new Error("Upload failed: " + response.statusText);
    }
    const json = await response.json();
    if (json.error) {
        throw new Error(json.error);
    }
    return json;
}

/**
 * Confirm / submit a community book after the user reviews the upload preview.
 *
 * @param {Object} bookData — metadata to finalize submission (title, heTitle, license, etc.)
 * @returns {Promise<{success: boolean, bookId: string, title: string, url: string}>}
 */
export async function confirmCommunityBook(bookData) {
    if (USE_MOCKS) {
        return Promise.resolve(_mockConfirmResponse(bookData));
    }

    const response = await fetch(Sefaria.apiHost + "/api/community-books/confirm", {
        method: "POST",
        headers: _csrfHeaders(true),
        credentials: "same-origin",
        body: JSON.stringify(bookData),
    });

    if (!response.ok) {
        throw new Error("Confirm failed: " + response.statusText);
    }
    const json = await response.json();
    if (json.error) {
        throw new Error(json.error);
    }
    return json;
}

/**
 * Fetch the list of approved community books.
 *
 * @param {Object} [params] — optional query params (e.g. { category, topic, offset, limit })
 * @returns {Promise<Array<{title, heTitle, description, heDescription, submittedBy, submitterName,
 *           submittedAt, submissionStatus, license, categories, topics, url}>>}
 */
export async function getCommunityBooks(params = {}) {
    if (USE_MOCKS) {
        return Promise.resolve([..._MOCK_BOOKS]);
    }

    const queryString = Object.keys(params).length
        ? "?" + new URLSearchParams(params).toString()
        : "";

    const response = await fetch(
        Sefaria.apiHost + "/api/community-books/" + queryString,
        {
            headers: { "X-CSRFToken": Cookies.get("csrftoken") },
            credentials: "same-origin",
        }
    );

    if (!response.ok) {
        throw new Error("getCommunityBooks failed: " + response.statusText);
    }
    const json = await response.json();
    if (json.error) {
        throw new Error(json.error);
    }
    return json;
}

/**
 * Bulk-fetch community books by title for use in topic-page tabs.
 *
 * NOTE for backend: endpoint expected at GET /api/community-books/bulk/?titles=<csv>
 * Returns an object keyed by title, not an array — matches the topic-page tab data shape.
 *
 * @param {string[]} ids — array of book titles (used as identifiers until backend assigns IDs)
 * @returns {Promise<Object.<string, {sheet_id, sheet_title, sheet_summary, publisher_name,
 *           publisher_id, publisher_url, publisher_image, is_community_book, license, order}>>}
 */
export async function getBulkCommunityBooks(ids) {
    if (USE_MOCKS) {
        // Return only the entries whose titles are in `ids`
        const result = {};
        for (const id of ids) {
            if (_MOCK_BULK_BOOKS[id]) {
                result[id] = _MOCK_BULK_BOOKS[id];
            }
        }
        return Promise.resolve(result);
    }

    const queryString = ids.length
        ? "?" + new URLSearchParams({ titles: ids.join(",") }).toString()
        : "";

    const response = await fetch(
        Sefaria.apiHost + "/api/community-books/bulk/" + queryString,
        {
            headers: { "X-CSRFToken": Cookies.get("csrftoken") },
            credentials: "same-origin",
        }
    );

    if (!response.ok) {
        throw new Error("getBulkCommunityBooks failed: " + response.statusText);
    }
    const json = await response.json();
    if (json.error) {
        throw new Error(json.error);
    }
    return json;
}
