import {Router} from "express"
import { errorHandler, multerHost, validationMiddleware } from "../../Middlewares/index.js";
import * as controller from "./doctor.controller.js";
import * as validation from "./doctor.schema.js"
import { extensions } from "../../Utils/index.js";
import { parseJSONField } from "../../Middlewares/parseJSONField .js";

const doctorRouter=Router();

doctorRouter.post(
    '/doctorRegister',
    errorHandler(multerHost({ allowedExtensions: [...extensions.Images, ...extensions.Documents] }).fields([
        { name: "profilePic", maxCount: 1 }, // Single image file
        { name: "certifications", maxCount: 1 },   // Single PDF file
    ])),
    parseJSONField("workDays"),
    errorHandler(validationMiddleware(validation.registerDoctorSchema)),
    errorHandler(controller.registerDoctor)
);

doctorRouter.get(
    "/confirmation/:confirmationToken",
    errorHandler(validationMiddleware(validation.verifySchema)),
    errorHandler(controller.verifyEmail)
);

export {doctorRouter};