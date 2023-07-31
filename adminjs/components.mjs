import { ComponentLoader } from 'adminjs'

const componentLoader = new ComponentLoader()

const Components = {
    BulkEdit: componentLoader.add('BulkEdit', './bulkedit'),
    // other custom components
}

export { componentLoader, Components }