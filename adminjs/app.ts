// ... other imports
import mongoose from 'mongoose'
import * as AdminJSMongoose from '@adminjs/mongoose'

import { Category } from './category.entity.js'

AdminJS.registerAdapter({
  Resource: AdminJSMongoose.Resource,
  Database: AdminJSMongoose.Database,
})

// ... other code
const start = async () => {
  await mongoose.connect('<mongo db url>')
  const adminOptions = {
    // We pass Category to `resources`
    resources: [Category],
  }
  // Please note that some plugins don't need you to create AdminJS instance manually,
  // instead you would just pass `adminOptions` into the plugin directly,
  // an example would be "@adminjs/hapi"
  const admin = new AdminJS(adminOptions)
  // ... other code
}

start()