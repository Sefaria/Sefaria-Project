/*       _(p, 'birthYearIsApprox', True)
            else:
                _(p, 'birthYearIsApprox', False)
            m = re.search(r"\d+", l[5])
            if m:
                _(p, 'birthYear', m.group(0))
        if len(l[7]) > 0:
            if "c" in l[7]:
                _(p, 'deathYearIsApprox', True)
            else:
                _(p, 'deathYearIsApprox', False)
            m = re.search(r"\d+", l[7])
            if m:
                _(p, 'deathYear', m.group(0))
        _(p, "birthPlace", l[6])
        _(p, "deathPlace", l[8])
        _(p, "enWikiLink", l[12])
        _(p, "heWikiLink", l[13])
        _(p, "jeLink", l[14])
        _(p, "sex", l[24])
        if p.get_property('enBio') or p.get_property('heBio'):
            p.description = {
                'en': p.get_property('enBio'),
                'he': p.get_property('heBio')
            }*/
const mongoose = require('mongoose');
const BookSchema = new mongoose.Schema(
  {
      heBio: {type: String},
      enBio: {type: String},
      era: {type: String},

  },
  { timestamps: true,
  collection: 'index'},
);

const Book = mongoose.model('index', BookSchema, 'index');

module.exports = {
  Book, BookSchema
};