import axios from 'axios';
import { setupCache } from 'axios-cache-adapter';

// Create `axios-cache-adapter` instance
const cache = setupCache({
  maxAge: 24 * 60 * 60 * 1000, // Cache for 24 hours
  exclude: { query: false },
});

// Create axios instance with caching
const axiosApi = axios.create({
  adapter: cache.adapter
});

export default axiosApi;
