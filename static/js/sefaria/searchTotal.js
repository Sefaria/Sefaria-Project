export class SearchTotal {
    constructor({value=0, relation="eq"} = {}) {
        this._value = value;
        this._relation = relation;
    }
    getValue = () => this._value;
    add = (num) => this._value += num;
    asString = () => `${this._value.addCommas()}${this._getRelationString()}`;
    _getRelationString = () => this._relation === 'gte' ? '+' : '';
    combine = (other) => {
        if (!(other instanceof SearchTotal)) {
            throw new TypeError('Parameter must be an instance of SearchTotal.');
        }
        const newValue = this.getValue() + other.getValue();
        let newRelation = this._relation;
        if (other._relation === 'gte' || this._relation === 'gte') {
            newRelation = 'gte';
        }
        return new SearchTotal({value: newValue, relation: newRelation});
    };
}


