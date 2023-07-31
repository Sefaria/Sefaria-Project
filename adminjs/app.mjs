import AdminJS from 'adminjs'
import AdminJSExpress from '@adminjs/express'
import express from 'express'
import mongoose from 'mongoose'
import * as AdminJSMongoose from '@adminjs/mongoose'
import { Category } from './category.entity.js'
import {Book} from './index.entity.js'
import { Components } from './components.mjs'
const PORT = 3000;

AdminJS.registerAdapter({
  Resource: AdminJSMongoose.Resource,
  Database: AdminJSMongoose.Database,
})
const BulkEdit = () => {

}
const start = async () => {
  const app = express();

  const db = await mongoose.connect('mongodb://127.0.0.1:27017/sefaria');
  const adminOptions = {
    // We pass Category to `resources`
    resources: [
        {resource: Book,
        options: {actions:
              {
                customSave: {
                actionType: 'record',
                icon: 'Edit',
                isVisible: true,
                handler: customSaveHandler
              }}}},
      {resource: Category,
          options: {
              actions: {
                      bulkEdit: {
                        actionType: 'bulk',
                        icon: 'Edit',
                        isVisible: true,
                        handler: () => {},
                        // handler: async (request, response, context) => {
                        //   alert('hi');
                        //   console.log('***');
                        //   console.log(request);
                        //   console.log(response);
                        //   console.log(context);
                        //   console.log('!!!');
                        //   const { record, currentAdmin } = context
                        //   return {
                        //     record: record.toJSON(currentAdmin),
                        //     msg: 'Hello world',
                        //   }
                        // },
                       component: Components.BulkEdit,
                        },
          }, filterProperties: ['path']}}]
  }

  // Please note that some plugins don't need you to create AdminJS instance manually,
  // instead you would just pass `adminOptions` into the plugin directly,
  // an example would be "@adminjs/hapi"
  const admin = new AdminJS(adminOptions);
  const adminRouter = AdminJSExpress.buildRouter(admin)
  app.use(admin.options.rootPath, adminRouter)

  app.listen(PORT, () => {
    console.log(`AdminJS started on http://localhost:${PORT}${admin.options.rootPath}`)
  })
}

start()

// $ yarn add express tslib express-formidable express-session

/*
var mongoose = require('mongoose');
var AdminJSMongoose = require('@adminjs/mongoose');

var Category = require('./category.entity.js');

AdminJS.registerAdapter({
  Resource: AdminJSMongoose.Resource,
  Database: AdminJSMongoose.Database,
})

// ... other code
var start = async function() {
  await mongoose.connect('<mongo db url>');
  var adminOptions = {
    // We pass Category to `resources`
    resources: [Category],
  }
  // Please note that some plugins don't need you to create AdminJS instance manually,
  // instead you would just pass `adminOptions` into the plugin directly,
  // an example would be "@adminjs/hapi"
  var admin = new AdminJS(adminOptions);
  // ... other code
}

start();
 */