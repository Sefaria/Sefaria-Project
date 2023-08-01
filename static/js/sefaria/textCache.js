class SegmentLanguageVersions {
    setVersion(versionTitle, version) {
        this[versionTitle] = version;
    }
    updateVersion(SegmentLanguageVersions) {
        Object.keys(SegmentLanguageVersions).forEach((versionTitle) => {
            this.setVersion(versionTitle, SegmentLanguageVersions[versionTitle]);
        });
    }
    getVersion(versionTitle) {
        return this[versionTitle];
    }
}


class SegmentVersions {
    addLangIfMissing(language) {
        if (!this.hasOwnProperty(language)) {
            this[language] = new SegmentLanguageVersions();
        }
    }
    setVersion(language, versionTitle, version) {
        this.addLangIfMissing(language);
        this[language].setVersion(versionTitle, version);
    }
    updateVersions(segmentVersion) {
        Object.keys(segmentVersion).forEach((language) => {
            this.addLangIfMissing(language);
            this[language].updateVersion(segmentVersion[language]);
        });
    }
    getVersion (language, versionTitle) {
        return this[language]?.getVersion(versionTitle);
    }
}


class SectionVersions {
    constructor() {
        this.segments = [];
    }
    setVersion(segmentsVersionsArray) {
        segmentsVersionsArray.forEach((segment, index) => {
            if (this.segments[index]) {
                this.segments[index].updateVersion(segment);
            } else {
                this.segments[index] = segment;
            }
        });
    }
    getVersion(language, versionTitle) {
        return this.segments.map((segment) => {
            segment.getVersion(language, versionTitle);
        });
    }
}


export default class TextCache {
    setSegmentVersion(ref, language, versionTitle, version) {
        if (!this.hasOwnProperty(ref)) {
            this[ref] = new SegmentVersions;
        }
        this[ref].setVersion(language, versionTitle, version);
    }
    setSectionVersion(ref, language, versionTitle, version) {
        if (!this.hasOwnProperty(ref)) {
            this[ref] = new SectionVersions;
        }
        this[ref].setVersion(language, versionTitle, version);
    }
    getVersion(ref, language, versionTitle) {
        return this[ref]?.getVersion(language, versionTitle);
    }
}
