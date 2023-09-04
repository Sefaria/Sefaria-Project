export const getLayoutOptions = (sourceDir) => {
    return {
        'mono': ['continued', 'segmented'],
        'bi-rtl': ['vertical', 'horizontal'],
        'bi-ltr': ['vertical', 'horizontal'],
        'mixed': [(sourceDir === 'rtl' ? 'vertical-rtlltr' : 'vertical-ltrrtl'), 'horizontal-b2b', 'horizontal-f2f']
    };
}
