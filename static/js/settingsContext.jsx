import React, { Component, createContext } from "react";

// Provider and Consumer are connected through their "parent" context
const SettingsContext = createContext({
        settings: {
            language: "bilingual",
            layoutDefault: "segmented",
            layoutTalmud: "continuous",
            layoutTanakh: "segmented",
            aliyotTorah: "aliyotOff",
            vowels: "all",
            biLayout: "stacked",
            color: "light",
            fontSize: 62.5
        }
});

// Provider will be exported wrapped in ConfigProvider component.
class SettingsProvider extends Component {
  state = {
    settings: {
        language:      Sefaria._siteSettings.TORAH_SPECIFIC ? "binlinual" : "english",
        layoutDefault: "segmented",
        layoutTalmud: "continuous",
        layoutTanakh: "segmented",
        aliyotTorah: "aliyotOff",
        vowels: "all",
        biLayout: "stacked",
        color: "light",
        fontSize: 62.5
    },
    updateSettings: () => {
      const setTo = !this.state.userLoggedIn;
      this.setState({ userLoggedIn: setTo });
    }
  };

  render() {
    return (
      <Provider
        value={{
          userLoggedIn: this.state.userLoggedIn,
          profile: this.state.profile,
          toggleLogin: this.state.toggleLogin
        }}
      >
        {this.props.children}
      </Provider>
    );
  }
}

export { SettingsProvider };

// I make this default since it will probably be exported most often.
export default SettingsContext;
