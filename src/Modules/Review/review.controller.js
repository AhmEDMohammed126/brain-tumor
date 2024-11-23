import { Doctor,Review } from "../../../DB/Models/index.js";
import { ErrorClass, OrdeStatus, ReviewStatus } from "../../Utils/index.js";

/**
 * @api {post} /reviews/addReview Add review
 */
export const addReview=async(req, res, next) => {
    const userId = req.authUser._id;
    const { doctorId,rating,review } = req.body;

    //check if patient has already reviewed the doctor 
    const reviewExist = await Review.findOne({ userId, doctorId });
    if (reviewExist) {
        return next(new ErrorClass ("You already reviewed this Doctor", 400,"You already reviewed this Doctor"));
    }
    //check if product exist
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
        return next(new ErrorClass ("Doctor not found", 404,"Doctor not found"));
    }
    //check if patient go to the doctor list

    // TODO: check if doctor patients list includes the patient
    
    // const patientVistDoctor = await Doctor.findOne({ userId, "products.productId": productId,orderStatus:OrdeStatus.DELIVERED });
    // if(!userBoughtProduct){
    //     return next(new ErrorClass ("You must buy the product to leave a review", 400,"You must buy the product to leave a review"));
    // }

    const reviewInstance = new Review({
        userId,
        doctorId,
        rating,
        review
    })
    await reviewInstance.save();
    res.status(201).json({review:reviewInstance});
}

/**
 * @api {get} /reviews/listReviews listReviews
 */

export const listReviews=async(req, res, next) => {

    const reviews = await Review.find().populate(
        [
        {
            path:"userId",
            select:"userName email -_id"
        },
        {
            path:"doctorId",
            select:"userName rating -_id"
        }
    ]
    );
    res.status(200).json({ reviews });
}

/**
 * @api {get} /reviews/getReviews/:productId get product reviews
 */

export const getReviews=async(req, res, next) => {

    const doctorId = req.params.doctorId;
    const reviews = await Review.find({ doctorId, reviewStatus:ReviewStatus.APPROVED }).populate(
        [
            {
                path:"userId",
                select:"userName email -_id"
            }
        ]
    );
    if(reviews.length==0){
        return next(new ErrorClass ("No reviews found", 404,"No reviews found"));
    }
    res.status(200).json({ reviews });
}

/**
 * @api {patch} /reviews/approveOrRejectReview/:reviewId  approve or reject review
 */
export const approveOrRejectReview =async (req, res, next) => {
    const { reviewId } = req.params;
    const actionDoneBy=req.authUser._id;
    const { accept , reject } = req.body;
    if(accept && reject){
        return next(new ErrorClass ("You can't accept and reject at the same time", 400,"You can't accept and reject at the same time"));
    }
    const review = await Review.findOne({_id:reviewId});
    if (!review) {
        return next(new ErrorClass ("Review not found", 404,"Review not found"));
    }
    if (accept) {
        review.reviewStatus = ReviewStatus.APPROVED;
    }
    if (reject) {
        review.reviewStatus = ReviewStatus.REJECTED;
    }
    review.actionDoneBy=actionDoneBy;
    await review.save();
    res.status(200).json({ review });
}
