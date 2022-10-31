

class FeatureTrack {
    // Helper functions for tracking use of features (with Google Analytics 4)
    static visible(feature_name) {
        if (typeof window !== 'undefined') {
            console.log("in FeatureTrack")
            gtag('event', 'feature_seen', {
                'feature_name': feature_name,
                // 'book': analytics_dict.book,
                // 'ref': analytics_dict.ref,
                // 'item_category' : "Tanakh",
                'logged_in': !!Sefaria._uid,
                'interface_language': Sefaria.interfaceLang,
            });
        }
    }

    static clicked(feature_name) {
        if (typeof window !== 'undefined') {
            console.log("in FeatureTrack clicked")
            gtag('event', 'feature_clicked', {
                'feature_name': feature_name,
                // 'book': analytics_dict.book,
                // 'ref': analytics_dict.ref,
                'logged_in': !!Sefaria._uid,
                'interface_language': Sefaria.interfaceLang,
            });
        }
    }
}

class SideBarFeatureTrack extends FeatureTrack {
    // inherits Helper functions for tracking use of features (with Google Analytics 4)
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
