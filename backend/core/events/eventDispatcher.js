// src/features/payment/events/eventDispatcher.js
import { EventEmitter } from "events";

class EventDispatcher extends EventEmitter {
  constructor() {
    super();
    // Prevents Node.js memory leak warnings if we have many listeners
    this.setMaxListeners(50);
  }

  /**
   * Dispatch an event
   * @param {string} event - Event type
   * @param {any} payload - Data to send with event
   */
  dispatch(event, payload) {
    this.emit(event, payload);
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event type
   * @param {Function} handler - Callback function
   */
  subscribe(event, handler) {
    this.on(event, handler);
  }

  /**
   * Unsubscribe from an event
   * @param {string} event - Event type
   * @param {Function} handler - Callback function
   */
  unsubscribe(event, handler) {
    this.removeListener(event, handler);
  }
}

// Export a single shared dispatcher instance
const eventDispatcher = new EventDispatcher();
export default eventDispatcher;
