
//

class TrackG4 {

    /**
     * This function should be called in components that we want to track click events on.
     * before the return you need to add in this line `const analyticsContext = useContext(AdContext);` to get the context.
     * and then call the gtagClick as fallowing: onClick={e => TrackG4.gtagClick(e, onClick, `ToolTipped`, {"classes": `${classes}`}, analyticsContext)}
     * if there is an onClick function already pass it in the `onClick` parameter in the gtagClick function.
     */

    static gtagClick = (e, onClick = () => {
    }, comp_name, params, analyticsContext) => {
        const contextParams = {
            "keywordTargets": analyticsContext.keywordTargets,
            "interfaceLang": analyticsContext.interfaceLang
        }
        const allParams = Object.assign({}, params, contextParams)
        gtag("event", `onclick_${comp_name}`, allParams)
        onClick(e)
    };

}
export default TrackG4