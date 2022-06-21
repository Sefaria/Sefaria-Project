class TrendManager:
    def __init__(self, name, key, period, valueThresholdMin=5):                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
        self.name = name
        self.key = key
        self.period = period
        self.valueThresholdMin = valueThresholdMin

    def getPersonInfo(self, trends):
        person_info = {
            "key": self.key,
            "name": self.name+"_"+self.period,
            "period": self.period
        }
        try:
            if trends.get(self.key, {}).get(self.period) >= self.valueThresholdMin:
                value = True
            else:
                value = False
            person_info["value"] = value
        except:
            person_info["value"] = False
        return person_info


class CategoryTrendManager(TrendManager):
    def __init__(self, categoryName, period="alltime", valueThresholdMin=5):
        key = "ReadInCategory" + categoryName
        name = "read_in_category_" + categoryName.replace(" ","_")
        TrendManager.__init__(self,name,key,period, valueThresholdMin)

class SheetReaderManager(TrendManager):
    def __init__(self, period="alltime"):
        TrendManager.__init__(self,"source_sheet_reader","SheetsRead",period)

class ParashaLearnerManager(TrendManager):
    def __init__(self, period="currently"):
        TrendManager.__init__(self,"parasha_learner", "ParashaLearner", period)

    def getPersonInfo(self, trends):
        person_info = {
            "key": self.key,
            "name": self.name+"_"+self.period,
            "period": self.period
        }
        try:
            if trends.get(self.key, {}).get(self.period):
                value = True
            else:
                value = False
            person_info["value"] = value
        except:
            person_info["value"] = False
        return person_info

class SheetCreatorManager(TrendManager):
    def __init__(self, period="alltime", public=False, valueThresholdMin=3):
        name = "source_sheet_creator_over_" + str(valueThresholdMin) + "_sheets"
        TrendManager.__init__(self,name,"SheetsCreated",period, valueThresholdMin=valueThresholdMin)
        self.public = public

    def getPersonInfo(self, trends):
        if(self.public == False):
            return TrendManager.getPersonInfo(self, trends)
        else:
            person_info_public = {
                "key": self.key+"Public",
                "name": self.name+"_public_"+self.period,
                "period": self.period,
                "value": False
            } if self.public else {}
            if (self.public == True):
                try:
                    if trends.get(self.key+"Public", {}).get(self.period) >= 1:
                        value = True
                    else:
                        value = False
                    person_info_public["value"] = value
                except:
                    person_info_public["value"] = False
            if(person_info_public["value"] == False):
                return person_info_public 
        
            person_info_public["value"] = TrendManager.getPersonInfo(self,trends)["value"]
            return person_info_public

class CustomTraitManager(TrendManager):
    def __init__(self, customTraitName, customTraitKey, period="alltime"):
        TrendManager.__init__(self,customTraitName,customTraitKey,period)
    
    def getPersonInfo(self, trends):
        person_info = {
            "key": self.key,
            "name": self.name,
            "period": self.period
        }
        try:
            value = trends.get(self.key, {}).get(self.period)
        except:
            value = None
        person_info["value"] = value
        return person_info
