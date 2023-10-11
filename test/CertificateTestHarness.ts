import { lookupCertificateArn, createIamServerCertificate, deleteIamServerCertificate } from '../lib/Certificate';

enum ARGS { FIND = 'find', CREATE = 'create', DELETE = 'delete'};

switch(process.argv[2]) {
 
  case ARGS.FIND:

  lookupCertificateArn('my-test-cert').then(response => {
      console.log(JSON.stringify(response, null, 2));
    }).catch(reason => {
      console.error(JSON.stringify(reason, null, 2));
    });
    break;

  case ARGS.CREATE:

    createIamServerCertificate('my-test-cert').then(response => {
      console.log(JSON.stringify(response, null, 2));
    }).catch(reason => {
      console.error(JSON.stringify(reason, null, 2));
    });
    break;

  case ARGS.DELETE:

    deleteIamServerCertificate('my-test-cert').then(response => {
      console.log(JSON.stringify(response, null, 2));
    }).catch(reason => {
      console.error(JSON.stringify(reason, null, 2));
    });
    break;
}

