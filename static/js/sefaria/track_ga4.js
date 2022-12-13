

class TrackGA4 {
  static event(event_name, event_parameters) {
    if (typeof window !== 'undefined') {
      console.log(event_name, event_parameters)
      gtag('event', event_name, event_parameters)
    }

  }
}

export default TrackGA4;
