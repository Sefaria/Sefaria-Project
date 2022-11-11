

class FeatureTrack {
    // Helper functions for tracking use of features (with Google Analytics 4)
    static visible(feature_name) {
        if (typeof window !== 'undefined') {
            console.log("in FeatureTrack")
            gtag('event', `feature_seen_${feature_name}`, {
                'feature_name': feature_name,
                'logged_in': !!Sefaria._uid,
                'interface_language': Sefaria.interfaceLang,
            });
        }
    }

    static clicked(feature_name, feature_data) {
        if (typeof window !== 'undefined') {
            console.log("in FeatureTrack clicked")
            gtag('event',  `feature_clicked_${feature_name}`, {
                'feature_name': feature_name,
                'logged_in': !!Sefaria._uid,
                'interface_language': Sefaria.interfaceLang,
                'feature_data' : feature_data? feature_data: {}}
            );
        }
    }
}

class SideBarFeatureTrack extends FeatureTrack {
    // Inherits Helper functions for tracking use of features (with Google Analytics 4)
    static visible(feature_name, analytics_dict) {
        super.visible()
        if (typeof window !== 'undefined') {
            gtag('event', 'feature_seen', {
                'book': analytics_dict.book,
                'ref': analytics_dict.ref,
            });
        }
    }
}

export default FeatureTrack;
