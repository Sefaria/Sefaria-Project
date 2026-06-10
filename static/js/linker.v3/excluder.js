/**
 * Class which decides whether a citation should be excluded from either linking or tracking (or both)
 */

export class LinkExcluder {

    constructor(excludeFromLinkingSelector, excludeFromTrackingSelector) {
        this.excludeFromLinkingSelector = excludeFromLinkingSelector;
        this.excludeFromTrackingSelector = excludeFromTrackingSelector;
        this.excludedFromLinking = {};
        this.excludedFromTracking = {};
    }

    shouldExclude(matchKey, node) {
        // Walk up node tree to see if this context should be excluded from linking or tracking
        let p = node;
        // it is possible this node doesn't fit criteria to be excluded, but an earlier portion did.
        let excludeFromLinking = this.excludedFromLinking[matchKey];
        let excludeFromTracking = this.excludedFromTracking[matchKey];
        while (p) {
            if (p.nodeName === 'A' || (this.excludeFromLinkingSelector && p.matches && p.matches(this.excludeFromLinkingSelector))) {
                excludeFromLinking = true;
                this.excludedFromLinking[matchKey] = true;
            }
            if (this.excludeFromTrackingSelector && p.matches && p.matches(this.excludeFromTrackingSelector)) {
                excludeFromTracking = true;
                this.excludedFromTracking[matchKey] = true;
            }
            if (excludeFromTracking && excludeFromLinking) { break; }
            p = p.parentNode;
        }
        return [excludeFromLinking, excludeFromTracking];
    }
}