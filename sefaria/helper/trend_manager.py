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


