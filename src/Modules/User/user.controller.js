import { sendEmailService } from "../../../services/send-email.service.js"
import { compareSync, hashSync } from "bcrypt"
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import otpGenerator from "otp-generator";
import { cloudinaryConfig, defineUserType, ErrorClass, systemRoles, uploadFile } from "../../Utils/index.js";
import {User, Admin } from "../../../DB/Models/index.js";

/**
 * @api {post} /users/register Register User
 */
export const registerAdmin = async(req, res,next) =>{
    const {firstName,lastName,email,password,userType,gender,age,phone}=req.body

    // check if the email is already registered
    const existingUser=await User.findOne({email,isMarkedAsDeleted:false})
    if(existingUser)
        return next(
            new ErrorClass("Invalid credentials", 400, "Email or User name is already registered")
        );
    // upload the image to cloudinary
    if(!req.file)return next(new ErrorClass('Please upload an image',400,'Please upload an image'));
    const customId = nanoid(4);
    const { secure_url, public_id } = await uploadFile({
        file: req.file.path,
        folder: `${process.env.UPLOADS_FOLDER}/Users/${customId}`,
    });
    
    const userInstance=new User({
        email,
        password,
        userType,
    })

    //check if userType
    let adminInstance=null;
    if(userType==systemRoles.ADMIN){
        adminInstance=new Admin({
            firstName,
            lastName,
            email,
            userType,
            status:false,
            age,
            gender,
            phone,
            profilePic:{
                public_id,
                secure_url
            },
            customId
        })
    }

    
    //generate token instead of sending _id
    const confirmationToken = jwt.sign(
        { user: adminInstance },
        process.env.CONFIRM_TOKEN,
        { expiresIn: "1h" }
    );
    // generate email confirmation link
    const confirmationLink = `${req.protocol}://${req.headers.host}/users/confirmation/${confirmationToken}`;
    //sending email
    const isEmailSent = await sendEmailService({
        to: email,
        subject: "welcome",
        htmlMessage: `<a href=${confirmationLink}>please verify your account</a>`,
    });

    if (isEmailSent.rejected.length) {
        return res
            .status(500)
            .json({ message: "verification email sending is failed " });
    }

    await userInstance.save();
    await adminInstance.save();

    res.status(201).json({message:"User created successfully",data:adminInstance})
}
/*
* @api {get} /users/confirmation/:confirmationToken  Verify Email
 * @param {req} req 
 * @param {res} res 
 * @param {next} next 
 * @returns  {object} return response {message, user}
 * @description verify Email of user
 */
export const verifyEmail = async (req, res, next) => {
    //destruct token from params
    const { confirmationToken } = req.params;
    //verifing the token
    const data = jwt.verify(confirmationToken, process.env.CONFIRM_TOKEN);
    const user=await User.findOneAndUpdate({email:data?.user.email,isEmailVerified: false},{ isEmailVerified: true },
        { new: true }).select('-password -__v');
    if (!confirmedUser) {
        return next(
            new ErrorClass("Invalid credentials", 400, "not confirmed")
        );
    }
      // response
    res.status(200).json({ message: "User email successfully confirmed ", user });
};

/***
 * @api {post} /users/login  Login user
 * @param {object} req
 * @param {object} res
 * @param {object} next
 * @returns {object} return response {message, token}
 * @description login user
 */
export const login = async (req, res, next) => {
    // destruct email and password from req.body
    const { email, password } = req.body;
    // find user
    const user = await User.findOne({email,isEmailVerified:true,isMarkedAsDeleted:false});
    if (!user) {
        return next(
            new ErrorClass("Invalid credentials", 400, "Invalid email or password")
        );
    }
    const isMatch = compareSync(password, user.password);
    if (!isMatch) {
        return next(
            new ErrorClass("Invalid credentials", 400, "Invalid email or password")
        );
    }
    //select user 
    const Ouser=await defineUserType(user);

    //update status
    Ouser.status = true;
    await Ouser.save();
    // generate the access token
    const token = jwt.sign({ userId: Ouser._id,userType:Ouser.userType }, process.env.LOGIN_SECRET,{expiresIn: "7d"});
    // response
    res.status(200).json({ message: "Login success", token });
};

/**
 * @api {patch} /users/logout  Logout user
 */
export const logOut = async (req, res, next) => {
    //destruct user from req
    const { authUser } = req;
    //update status of user
    authUser.status = false;
    await authUser.save();
    //respons
    res.status(200).json({ message: "logged out successfuly" });
};

/**
 * @api {post} /users/forget-password  Forget password
 */
export const forgetPassword = async (req, res, next) => {
    // Get the email from the request body
    const { email } = req.body;
    // Find the user with the provided email or recovery email
    const isUserExists = await User.findOne({email,isMarkedAsDeleted:false});
    // If the user does not exist, throw an error
    if (!isUserExists) {
        return next(
            new ErrorClass("email doesn't exist", 400, "email doesn't exist")
        );
    }
    // Generate a random password reset code
    const otp = otpGenerator.generate(6, {
        upperCaseAlphabets: false,
        specialChars: false,
    });
    isUserExists.otp = otp;
    // Send an email to the user with a random hashed reset code
    const isEmailSent = await sendEmailService({
        to: email,
        subject: `welcome ${isUserExists.userName}`,
        htmlMessage: `<h1>your verify code for reseting the password is : ${otp}  it is valid for 10 minutes</h1>`,
    });
    // If the email sending fails, return an error response
    if (isEmailSent.rejected.length) {
        return res
        .status(500)
        .json({ message: "verification email sending is failed " });
    }
    // Set the password reset expiration time to 10 minutes from now
    isUserExists.passwordResetExpires = Date.now() + 10 * 60 * 1000;
    isUserExists.verifyPasswordReset=false;
    // Save the updated user
    await isUserExists.save();
    // Return a success response
    res.status(200).json({ message: "check your email for password reset code" });
};

/**
 * @api {post} /users/verify-forget-password  Verify forget password
 */
export const verifyForgetPassword = async (req, res, next) => {
    // Get the otp from the request body
    const {otp } = req.body;
    // Find the user 
    const isUserExists = await User.findOne({
        otp:otp,
        passwordResetExpires: { $gt: Date.now() },
    }) 
    // If the user does not exist, throw an error
    if (!isUserExists) {
        return next(
            new ErrorClass("invalid code or code expired", 400, "invalid code or code expired")
        );
    }

    // Set the password reset code to null
    isUserExists.otp = null;  
    isUserExists.verifyPasswordReset=true;
    // Save the updated user
    await isUserExists.save();
    res.status(200).json({ message: "code verified successfully" });
};  

/**
   * @api {post} /users/reset-password  Reset password
   * @param {Object} req - The request object.
   * @param {Object} req.body - The request body containing the email and new password.
   * @param {string} req.body.email - The email of the user.
   * @param {string} req.body.password - The new password for the user.
   * @param {Object} res - The response object.
   * @param {Function} next - The next middleware function.
   * @returns {Promise<void>} - A promise that resolves when the password is reset successfully.
   * @throws {Error} - If the user with the provided email does not exist.
   * @throws {Error} - If the password reset code is not verified for the user.
   */
export const resetPassword = async (req, res, next) => {
    // Get the email and new password from the request body
    const { email, password } = req.body;
    // Find the user by the password reset token
    const user = await User.findOne({ email: email ,isMarkedAsDeleted:false}); 
    // If the user does not exist, throw an error
    if (!user) {
        return next(
            new ErrorClass("ther is no user with this email", 400, "ther is no user with this email")
        );
    }
    // If the password reset code is not verified for the user, throw an error
    if(!user.verifyPasswordReset){
        return next(
            new ErrorClass("reset code not verified", 400, "invalid reset code")
        );
    }
    // Delete the password reset and verification fields from the user object
    user.verifyPasswordReset = undefined;//to delet it from db
    user.passwordResetExpires = undefined;
    user.password=password;

    // Save the updated user
    await user.save();
    // Return a success response
    res.status(200).json({ message: "password reset successfully" });
};

// export const softDeleteUser = async (req, res, next) => {
//     const {authUser}=req;
//     const user=await User.findByIdAndUpdate(authUser._id,{isMarkedAsDeleted:true,status:false},{new:true})
//     if(!user)
//         return next(
//             new ErrorClass("ther is no user with this email", 400, "user not found")
//         );
//     return res.status(200).json({message:"user deleted"})
// }